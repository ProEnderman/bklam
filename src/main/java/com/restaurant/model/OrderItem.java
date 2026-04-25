package com.restaurant.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "order_items")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OrderItem {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;
    
    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "dish_id", nullable = false)
    private Dish dish;
    
    @Positive(message = "Quantity must be >= 1")
    @Column(nullable = false)
    private Integer qty;
    
    @NotNull
    @Column(name = "price_at_time", nullable = false, precision = 12, scale = 2)
    private BigDecimal priceAtTime;
    
    @Column(name = "line_total", nullable = false, precision = 12, scale = 2)
    private BigDecimal lineTotal = BigDecimal.ZERO;
    
    @Column(name = "comment", columnDefinition = "TEXT")
    private String comment;

    @OneToMany(mappedBy = "orderItem", fetch = FetchType.LAZY, cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderItemOption> options = new ArrayList<>();
    
    @PrePersist
    @PreUpdate
    public void calculateLineTotal() {
        if (priceAtTime != null && qty != null) {
            BigDecimal modifiersTotal = BigDecimal.ZERO;
            if (options != null) {
                for (OrderItemOption opt : options) {
                    BigDecimal delta = opt.getPriceDeltaSnapshot() != null ? opt.getPriceDeltaSnapshot() : BigDecimal.ZERO;
                    int oq = opt.getOptionQty() != null ? opt.getOptionQty() : 1;
                    modifiersTotal = modifiersTotal.add(delta.multiply(BigDecimal.valueOf(oq)));
                }
            }
            this.lineTotal = priceAtTime.add(modifiersTotal)
                    .multiply(BigDecimal.valueOf(qty))
                    .setScale(2, RoundingMode.HALF_UP);
        }
    }
}
