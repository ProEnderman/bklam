package com.restaurant.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

@Entity
@Table(name = "hall_zones")
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class HallZone {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hall_map_id", nullable = false)
    private HallMap hallMap;

    @NotBlank
    @Column(nullable = false)
    private String name;

    @NotNull
    @Column(nullable = false)
    private Integer x;

    @NotNull
    @Column(nullable = false)
    private Integer y;

    @NotNull
    @Column(nullable = false)
    private Integer w;

    @NotNull
    @Column(nullable = false)
    private Integer h;

    /**
     * Optional painted zone shape stored as list of cells (each cell is {x,y}).
     * Stored as JSONB. When present, x/y/w/h represent the bounding box of these cells.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "cells", columnDefinition = "jsonb")
    private String cells;

    /**
     * Polygon vertices for editing (each vertex is {x,y}).
     * Stored as JSONB.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "vertices", columnDefinition = "jsonb")
    private String vertices;

    @Column(nullable = false)
    private String color = "#4f46e5";

    @Column(name = "active_for_waiter", nullable = false)
    private Boolean activeForWaiter = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
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

    public Long getHallMapId() {
        return hallMap != null ? hallMap.getId() : null;
    }
}



