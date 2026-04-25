package com.restaurant.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Entity
@Table(name = "table_reservations")
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(exclude = "hallTables")
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class TableReservation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "restaurant_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Restaurant restaurant;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "reservation_tables",
        joinColumns = @JoinColumn(name = "reservation_id"),
        inverseJoinColumns = @JoinColumn(name = "table_id")
    )
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "restaurant"})
    private Set<HallTable> hallTables = new HashSet<>();

    @Column(name = "customer_name")
    private String customerName;

    @Column(name = "customer_phone")
    private String customerPhone;

    @NotNull
    @Column(name = "guests_count", nullable = false)
    private Integer guestsCount = 1;

    @NotNull
    @Column(name = "start_at", nullable = false)
    private LocalDateTime startAt;

    @NotNull
    @Column(name = "end_at", nullable = false)
    private LocalDateTime endAt;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReservationStatus status = ReservationStatus.CONFIRMED;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getRestaurantId() {
        return restaurant != null ? restaurant.getId() : null;
    }

    /* ---- Computed convenience fields (serialised to JSON) ---- */

    public List<Long> getTableIds() {
        return hallTables != null
            ? hallTables.stream().map(HallTable::getId).sorted().toList()
            : List.of();
    }

    public String getTableLabels() {
        return hallTables != null
            ? hallTables.stream().map(HallTable::getLabel).sorted().collect(Collectors.joining(", "))
            : "";
    }

    public Integer getTotalCapacity() {
        return hallTables != null
            ? hallTables.stream().mapToInt(HallTable::getCapacity).sum()
            : 0;
    }

    public enum ReservationStatus {
        CONFIRMED,  // Подтверждено
        CANCELLED,  // Отменено
        COMPLETED,  // Завершено
        NO_SHOW     // Не пришёл
    }
}
