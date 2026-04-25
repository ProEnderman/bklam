package com.restaurant.model.loyalty;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "loyalty_guest_aliases")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class GuestAlias {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "primary_guest_id", nullable = false)
    private Guest primaryGuest;

    @Column(name = "alias_phone", nullable = false, unique = true, length = 20)
    private String aliasPhone;

    @Column(name = "merged_at", nullable = false)
    private LocalDateTime mergedAt;

    @PrePersist
    protected void onCreate() {
        mergedAt = LocalDateTime.now();
    }
}
