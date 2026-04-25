package com.restaurant.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "order_share_items")
@IdClass(OrderShareItemId.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OrderShareItem {

    @Id
    @Column(name = "share_id", nullable = false)
    private Long shareId;

    @Id
    @Column(name = "order_item_id", nullable = false)
    private Long orderItemId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "share_id", insertable = false, updatable = false)
    private OrderShare share;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_item_id", insertable = false, updatable = false)
    private OrderItem orderItem;

    @Column(nullable = false)
    private Integer qty = 1;
}
