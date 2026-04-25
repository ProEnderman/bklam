package com.restaurant.model.loyalty;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "loyalty_rfm_snapshots",
       uniqueConstraints = @UniqueConstraint(columnNames = {"guest_id", "snapshot_date"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RfmSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "guest_id", nullable = false)
    private Guest guest;

    @Column(name = "snapshot_date", nullable = false)
    private LocalDate snapshotDate;

    @Column(name = "recency_days", nullable = false)
    private Integer recencyDays = 0;

    @Column(name = "frequency_count", nullable = false)
    private Integer frequencyCount = 0;

    @Column(name = "monetary_sum", nullable = false, precision = 12, scale = 2)
    private BigDecimal monetarySum = BigDecimal.ZERO;

    @Column(name = "r_score", nullable = false)
    private Integer rScore = 1;

    @Column(name = "f_score", nullable = false)
    private Integer fScore = 1;

    @Column(name = "m_score", nullable = false)
    private Integer mScore = 1;

    @Column(name = "rfm_segment", length = 40)
    private String rfmSegment;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "segment_id")
    private Segment segment;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
