package com.restaurant.model.loyalty;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "loyalty_bonus_ledger")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class BonusLedgerEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", nullable = false)
    private BonusAccount account;

    @Enumerated(EnumType.STRING)
    @Column(name = "entry_type", nullable = false, length = 20)
    private LedgerEntryType entryType;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(name = "points_unit", nullable = false, length = 20)
    private String pointsUnit = "POINTS";

    @Column(name = "source_type", length = 40)
    private String sourceType;

    @Column(name = "source_id", length = 100)
    private String sourceId;

    @Column(name = "idempotency_key", unique = true, length = 200)
    private String idempotencyKey;

    @Column(columnDefinition = "jsonb")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    private String metadata = "{}";

    @Column(length = 500)
    private String description;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public Long getAccountId() {
        return account != null ? account.getId() : null;
    }
}
