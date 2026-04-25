package com.restaurant.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "shift_templates")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ShiftTemplate {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotNull
    @Column(nullable = false)
    private String name;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "restaurant_id")
    private Restaurant restaurant;
    
    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;
    
    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "day_of_week")
    private DayOfWeek dayOfWeek; // Один день; если задан daysOfWeek — не используется

    /** ISO 1=Пн … 7=Вс. Если непустой — шаблон только на эти дни. */
    @Column(name = "days_of_week")
    @JdbcTypeCode(SqlTypes.JSON)
    private List<Integer> daysOfWeek = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(name = "shift_type")
    private Shift.ShiftType shiftType = Shift.ShiftType.REGULAR;
    
    // RRULE для повторяемости (iCalendar format)
    @Column(name = "recurrence_rule", columnDefinition = "TEXT")
    private String recurrenceRule; // Например: "FREQ=WEEKLY;BYDAY=MO,WE,FR"
    
    @Column(name = "valid_from")
    private java.time.LocalDate validFrom;
    
    @Column(name = "valid_to")
    private java.time.LocalDate validTo;
    
    @Column(nullable = false)
    private Boolean isActive = true;
    
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
}




