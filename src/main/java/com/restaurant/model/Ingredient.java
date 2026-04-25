package com.restaurant.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "ingredients")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Ingredient {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotBlank(message = "Name is required")
    @Column(nullable = false)
    private String name;
    
    @NotNull(message = "Unit is required")
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Unit unit;
    
    @Min(value = 0, message = "Stock quantity must be >= 0")
    @Column(name = "stock_qty", nullable = false)
    private Double stockQty = 0.0;
    
    @Min(value = 0, message = "Min quantity must be >= 0")
    @Column(name = "min_qty", nullable = false)
    private Double minQty = 0.0;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "restaurant_id")
    private Restaurant restaurant;
    
    @Version
    @Column(nullable = false)
    private Integer version = 0; // Для Optimistic Locking - защита от race condition
    
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
    
    public Long getRestaurantId() {
        return restaurant != null ? restaurant.getId() : null;
    }
    
    public boolean isBelowMinimum() {
        return stockQty < minQty;
    }
}

