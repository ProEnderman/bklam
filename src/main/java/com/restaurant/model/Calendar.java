package com.restaurant.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "calendars")
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "branch"})
public class Calendar {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "organization_id")
    private Long organizationId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    private Restaurant branch; // Опционально, если календарь филиальный
    
    @Column(nullable = false)
    private String name;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "weekend_rule", nullable = false)
    private WeekendRule weekendRule = WeekendRule.SAT_SUN; // По умолчанию Сб/Вс выходные
    
    @Column(name = "weekend_days", columnDefinition = "TEXT")
    private String weekendDays; // JSON массив с номерами дней недели (1=Пн, 7=Вс) для CUSTOM режима
    
    @ElementCollection
    @CollectionTable(name = "calendar_special_dates", joinColumns = @JoinColumn(name = "calendar_id"))
    @Column(name = "date")
    private List<LocalDate> specialDates = new ArrayList<>(); // Список особых дат YYYY-MM-DD
    
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
    
    public enum WeekendRule {
        MON_FRI,    // Пн-Пт будни, Сб-Вс выходные (по умолчанию)
        SAT_SUN,    // Сб-Вс выходные (то же самое)
        CUSTOM      // Кастомное правило (можно расширить)
    }
}


