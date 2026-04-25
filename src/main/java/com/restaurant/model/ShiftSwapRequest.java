package com.restaurant.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "shift_swap_requests")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ShiftSwapRequest {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_shift_id", nullable = false)
    private Shift fromShift; // Смена, которую хотят отдать
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "to_shift_id")
    private Shift toShift; // Смена, которую предлагают взамен (опционально)
    
    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requested_by_id", nullable = false)
    private User requestedBy; // Кто запросил обмен
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requested_to_id")
    private User requestedTo; // Кому предложен обмен (если null - всем)
    
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private SwapStatus status = SwapStatus.PENDING;
    
    @Column(columnDefinition = "TEXT")
    private String comment;
    
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    @Column(name = "responded_at")
    private LocalDateTime respondedAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
    
    public enum SwapStatus {
        PENDING,        // Ожидает ответа
        ACCEPTED,      // Принят
        REJECTED,      // Отклонён
        CANCELLED      // Отменён
    }
}




