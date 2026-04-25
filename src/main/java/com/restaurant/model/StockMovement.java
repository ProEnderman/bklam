package com.restaurant.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "stock_movements")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class StockMovement {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ingredient_id", nullable = false)
    private Ingredient ingredient;
    
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StockMovementType type;
    
    @Positive(message = "Quantity must be > 0")
    @Column(nullable = false)
    private Double qty;
    
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StockMovementReason reason;
    
    @Column(name = "order_id")
    private Long orderId;
    
    @Column(name = "created_by", nullable = false)
    private String createdBy;
    
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "note", length = 255)
    private String note;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}

