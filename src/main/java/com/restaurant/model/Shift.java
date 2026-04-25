package com.restaurant.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "shifts")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Shift {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private User employee; // Сотрудник
    
    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "restaurant_id", nullable = false)
    private Restaurant restaurant;
    
    @NotNull
    @Column(name = "start_time", nullable = false)
    private LocalDateTime startTime;
    
    @NotNull
    @Column(name = "end_time", nullable = false)
    private LocalDateTime endTime;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "shift_type")
    private ShiftType shiftType = ShiftType.REGULAR;
    
    @Column(columnDefinition = "TEXT")
    private String comment;
    
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ShiftStatus status = ShiftStatus.DRAFT;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "template_id")
    private ShiftTemplate template; // Шаблон, из которого создана смена
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "swap_request_id")
    private ShiftSwapRequest swapRequest; // Запрос на обмен (если есть)
    
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    @Column(name = "published_at")
    private LocalDateTime publishedAt;
    
    @Column(name = "locked_at")
    private LocalDateTime lockedAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
    
    public enum ShiftType {
        REGULAR,        // Обычная смена
        OVERTIME,       // Сверхурочная
        HOLIDAY,        // Праздничная
        NIGHT           // Ночная
    }
    
    public enum ShiftStatus {
        DRAFT,          // Черновик
        PUBLISHED,      // Опубликовано
        LOCKED          // Заблокировано (после расчётов)
    }
}




