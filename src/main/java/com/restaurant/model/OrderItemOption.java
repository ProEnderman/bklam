package com.restaurant.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "order_item_options")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OrderItemOption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_item_id", nullable = false)
    private OrderItem orderItem;

    @Column(name = "template_id")
    private Long templateId;

    @Column(name = "option_item_template_id")
    private Long optionItemTemplateId;

    @Column(name = "group_title_snapshot", nullable = false, length = 200)
    private String groupTitleSnapshot;

    @Column(name = "option_title_snapshot", nullable = false, length = 200)
    private String optionTitleSnapshot;

    @Column(name = "price_delta_snapshot", nullable = false, precision = 12, scale = 2)
    private BigDecimal priceDeltaSnapshot = BigDecimal.ZERO;

    @Column(name = "option_qty", nullable = false)
    private Integer optionQty = 1;

    @Column(name = "value_int_snapshot")
    private Integer valueIntSnapshot;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() { createdAt = LocalDateTime.now(); }
}
