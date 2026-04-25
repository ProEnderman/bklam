package com.restaurant.model.loyalty;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "loyalty_guest_tier_history")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class GuestTierHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "guest_id", nullable = false)
    private Guest guest;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tier_id", nullable = false)
    private Tier tier;

    @Column(name = "assigned_at", nullable = false)
    private LocalDateTime assignedAt;

    @Column(length = 255)
    private String reason;

    @PrePersist
    protected void onCreate() {
        assignedAt = LocalDateTime.now();
    }
}
