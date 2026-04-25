package com.restaurant.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Entity
@Table(name = "orders")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Order {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderStatus status = OrderStatus.OPEN;
    
    @Column(name = "total_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal totalAmount = BigDecimal.ZERO;
    
    @Column(name = "created_by", nullable = false)
    private String createdBy;
    
    @Column(name = "name")
    private String name;
    
    @Column(name = "idempotency_key", unique = true, length = 64)
    private String idempotencyKey;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "order_source", length = 20)
    private OrderSource orderSource;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "guest_id")
    private com.restaurant.model.loyalty.Guest guest;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    @Column(name = "unpaid_reason", length = 500)
    private String unpaidReason;

    /** JSON-массив int: для каждого счёта split — индекс гостя-плательщика (кастомное объединение). */
    @Column(name = "payment_account_payer_json", length = 2000)
    private String paymentAccountPayerJson;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "restaurant_id")
    private Restaurant restaurant;

    /** Tenant location (new hierarchy); RLS pilot. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "location_id")
    private Location location;

    // Опционально: заказ может быть привязан к столу на карте зала
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "table_id")
    private HallTable table;
    
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderItem> items = new ArrayList<>();
    
    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (createdBy == null) {
            createdBy = "system";
        }
    }
    
    public void calculateTotalAmount() {
        this.totalAmount = items.stream()
            .map(OrderItem::getLineTotal)
            .filter(Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
    
    public Long getRestaurantId() {
        return restaurant != null ? restaurant.getId() : null;
    }

    public Long getLocationId() {
        return location != null ? location.getId() : null;
    }

    public Long getTableId() {
        return table != null ? table.getId() : null;
    }

    public Long getGuestId() {
        return guest != null ? guest.getId() : null;
    }
}

