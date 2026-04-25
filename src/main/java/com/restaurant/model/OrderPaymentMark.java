package com.restaurant.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "order_payment_marks")
@IdClass(OrderPaymentMarkId.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OrderPaymentMark {

    @Id
    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Id
    @Column(name = "payment_request_id", nullable = false, length = 255)
    private String paymentRequestId;

    @Column(name = "marked_at")
    private LocalDateTime markedAt;

    /** How this slot was paid: ONLINE (default) or CASH. Only meaningful when markedAt is non-null. */
    @Column(name = "paid_via", length = 20)
    private String paidVia;

    /** ID запроса в Telegram (для QR); ключ слота в payment_request_id стабильный (order_{id}_pay_{n}). */
    @Column(name = "telegram_payment_request_id", length = 255)
    private String telegramPaymentRequestId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", insertable = false, updatable = false)
    private Order order;
}
